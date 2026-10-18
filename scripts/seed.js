require('dotenv').config({ path: '../.env' });
const { MongoClient } = require('mongodb');
const { fakerPT_BR: faker } = require('@faker-js/faker');

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME;

if (!uri || !dbName) {
  console.error("Erro: MONGO_URI ou MONGO_DB_NAME não encontrados no arquivo .env");
  process.exit(1);
}

const client = new MongoClient(uri);

// itens possíveis no estoque dos abrigos
const CATALOGO = [
  { item: 'Água potável', categoria: 'Alimentos', unidade: 'litros', minimo: [80, 150] },
  { item: 'Cestas básicas', categoria: 'Alimentos', unidade: 'unidades', minimo: [10, 30] },
  { item: 'Leite em pó', categoria: 'Alimentos', unidade: 'latas', minimo: [15, 40] },
  { item: 'Fraldas', categoria: 'Higiene', unidade: 'pacotes', minimo: [10, 25] },
  { item: 'Kit higiene', categoria: 'Higiene', unidade: 'kits', minimo: [20, 50] },
  { item: 'Colchões', categoria: 'Abrigo', unidade: 'unidades', minimo: [10, 30] },
  { item: 'Cobertores', categoria: 'Roupas', unidade: 'unidades', minimo: [20, 60] },
  { item: 'Soro fisiológico', categoria: 'Medicamentos', unidade: 'frascos', minimo: [10, 30] },
];

// mesmo formato de data que a API grava
const iso = (d) => d.toISOString();

function gerarMantimento(abrigoId, base, emFalta) {
  const minimo = faker.number.int({ min: base.minimo[0], max: base.minimo[1] });
  const entrada = emFalta
    ? faker.number.int({ min: Math.round(minimo * 0.6), max: minimo * 2 })
    : faker.number.int({ min: minimo * 2, max: minimo * 4 });

  // saída deixa o estoque abaixo do mínimo nos itens em falta
  const saida = emFalta
    ? entrada - faker.number.int({ min: 0, max: Math.round(minimo * 0.5) })
    : faker.number.int({ min: 0, max: entrada - minimo });

  const dataEntrada = faker.date.recent({ days: 15 });
  const historico = [
    { tipo: 'entrada', quantidade: entrada, data: iso(dataEntrada), descricao: 'Entrada inicial no estoque' },
  ];
  if (saida > 0) {
    historico.push({
      tipo: 'saida',
      quantidade: saida,
      data: iso(faker.date.between({ from: dataEntrada, to: new Date() })),
      descricao: 'Distribuição para famílias do abrigo',
    });
  }

  return {
    item: base.item,
    categoria: base.categoria,
    unidade: base.unidade,
    quantidade: entrada - saida,
    quantidade_minima: minimo,
    abrigo_id: abrigoId,
    data_entrada: iso(dataEntrada),
    historico,
  };
}

async function popularBanco() {
  try {
    await client.connect();
    console.log("Conectado ao MongoDB Atlas com sucesso!");

    const db = client.db(dbName);

    const pessoasCol = db.collection('pessoas_resgatadas');
    const abrigosCol = db.collection('abrigos');
    const doacoesCol = db.collection('doacoes');
    const mantimentosCol = db.collection('mantimentos');

    await Promise.all([
      pessoasCol.deleteMany({}),
      abrigosCol.deleteMany({}),
      doacoesCol.deleteMany({}),
      mantimentosCol.deleteMany({})
    ]);

    console.log("Gerando dados heterogêneos...");

    // abrigos (ocupação começa em 0 e é calculada depois, pelas pessoas vinculadas)
    const abrigos = [];
    for (let i = 0; i < 15; i++) {
      if (i < 5) {
        abrigos.push({
          nome: `Abrigo Improvisado ${faker.location.street()}`,
          capacidade_estimada: faker.number.int({ min: 8, max: 20 }),
          ocupacao_atual: 0,
          status: 'aberto'
        });
      } else {
        const abrigo = {
          nome: `Ginásio ${faker.location.city()}`,
          endereco: faker.location.streetAddress(),
          coordenador: faker.person.fullName(),
          capacidade_maxima: faker.number.int({ min: 30, max: 80 }),
          ocupacao_atual: 0
        };
        // só parte dos ginásios tem necessidades urgentes registradas
        if (Math.random() < 0.4) {
          abrigo.necessidades_urgentes = faker.helpers.arrayElements(['Água potável', 'Colchões', 'Fraldas', 'Soro fisiológico'], { min: 1, max: 3 });
        }
        abrigos.push(abrigo);
      }
    }
    const { insertedIds } = await abrigosCol.insertMany(abrigos);
    abrigos.forEach((a, i) => { a.id = insertedIds[i].toString(); });

    // pessoas resgatadas
    const pessoas = [];
    for (let i = 0; i < 120; i++) {
      const cenario = Math.random();
      if (cenario < 0.4) {
        pessoas.push({
          nome_conhecido: faker.person.firstName(),
          local_resgate: faker.location.streetAddress(),
          data_resgate: faker.date.recent(),
        });
      } else if (cenario < 0.8) {
        pessoas.push({
          nome_completo: faker.person.fullName(),
          idade: faker.number.int({ min: 1, max: 90 }),
          tipo_sanguineo: faker.helpers.arrayElement(['A+', 'A-', 'O+', 'O-', 'B+', 'B-', 'AB+', 'AB-']),
          local_resgate: faker.location.streetAddress(),
          abrigo_atual: null
        });
      } else {
        pessoas.push({
          nome_completo: faker.person.fullName(),
          cpf: faker.string.numeric(11),
          idade: faker.number.int({ min: 1, max: 90 }),
          condicoes_saude: {
            medicacao_continua: faker.helpers.arrayElements(['Insulina', 'Losartana'], { min: 1, max: 2 })
          },
          contatos_emergencia: [
            { nome: faker.person.fullName(), telefone: faker.phone.number() }
          ],
          local_resgate: faker.location.streetAddress()
        });
      }
    }

    // vínculo pessoa -> abrigo, sem passar da capacidade
    // os improvisados enchem primeiro (ficam quase lotados), o resto vai para os ginásios
    const capacidade = (a) => a.capacidade_maxima ?? a.capacidade_estimada;
    const fila = faker.helpers.shuffle([...pessoas]);
    for (const a of abrigos.slice(0, 5)) {
      const alvo = Math.round(capacidade(a) * faker.number.float({ min: 0.85, max: 1 }));
      while (a.ocupacao_atual < alvo && fila.length) {
        fila.pop().abrigo_atual = a.id;
        a.ocupacao_atual++;
      }
    }
    const ginasios = abrigos.slice(5);
    for (const p of fila) {
      if (Math.random() < 0.3) continue; // continua sem abrigo
      const livres = ginasios.filter((g) => g.ocupacao_atual < capacidade(g));
      if (!livres.length) break;
      const g = faker.helpers.arrayElement(livres);
      p.abrigo_atual = g.id;
      g.ocupacao_atual++;
    }
    await pessoasCol.insertMany(pessoas);

    for (const a of abrigos) {
      const set = { ocupacao_atual: a.ocupacao_atual };
      if (a.status) set.status = a.ocupacao_atual >= capacidade(a) * 0.9 ? 'Superlotado' : 'aberto';
      await abrigosCol.updateOne({ _id: insertedIds[abrigos.indexOf(a)] }, { $set: set });
    }

    // mantimentos: 2 a 4 itens por abrigo, cerca de 1/3 dos abrigos com algum item em falta
    const mantimentos = [];
    for (const a of abrigos) {
      const itens = faker.helpers.arrayElements(CATALOGO, { min: 2, max: 4 });
      const comFalta = Math.random() < 0.35;
      itens.forEach((base, idx) => mantimentos.push(gerarMantimento(a.id, base, comFalta && idx === 0)));
    }
    await mantimentosCol.insertMany(mantimentos);

    // doaçoes
    const doacoes = [];
    for (let i = 0; i < 50; i++) {
      if (i % 2 === 0) {
        doacoes.push({
          item: faker.helpers.arrayElement(['Roupas de frio', 'Cestas básicas', 'Água Mineral 5L']),
          quantidade_estimada: faker.number.int({ min: 10, max: 100 }),
          data_recebimento: faker.date.recent()
        });
      } else {
        doacoes.push({
          categoria: faker.helpers.arrayElement(['Medicamentos', 'Alimentos Perecíveis']),
          item: faker.helpers.arrayElement(['Amoxicilina', 'Leite em pó', 'Soro']),
          quantidade_exata: faker.number.int({ min: 5, max: 50 }),
          lote: faker.string.alphanumeric(8).toUpperCase(),
          validade: faker.date.future(),
          doador: faker.person.fullName()
        });
      }
    }
    await doacoesCol.insertMany(doacoes);

    const vinculadas = pessoas.filter((p) => p.abrigo_atual).length;
    console.log(`${abrigos.length} abrigos, ${pessoas.length} pessoas (${vinculadas} em abrigos), ${mantimentos.length} mantimentos, ${doacoes.length} doações.`);
    console.log(`Sucesso! A base está pronta no Atlas para os desenvolvedores.`);

  } catch (error) {
    console.error("Erro ao popular o banco:", error);
  } finally {
    await client.close();
  }
}

popularBanco();
