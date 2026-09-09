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

async function popularBanco() {
  try {
    await client.connect();
    console.log("Conectado ao MongoDB Atlas com sucesso!");

    const db = client.db(dbName);

    const pessoasCol = db.collection('pessoas_resgatadas');
    const abrigosCol = db.collection('abrigos');
    const doacoesCol = db.collection('doacoes');

    await Promise.all([
      pessoasCol.deleteMany({}),
      abrigosCol.deleteMany({}),
      doacoesCol.deleteMany({})
    ]);

    console.log("Gerando dados heterogêneos...");

    // abrigos
    const abrigos = [];
    for (let i = 0; i < 15; i++) {
      if (i < 5) {
        abrigos.push({
          nome: `Abrigo Improvisado ${faker.location.street()}`,
          capacidade_estimada: faker.number.int({ min: 20, max: 50 }),
          status: 'Superlotado'
        });
      } else {
        abrigos.push({
          nome: `Ginásio ${faker.location.city()}`,
          endereco: faker.location.streetAddress(),
          coordenador: faker.person.fullName(),
          capacidade_maxima: faker.number.int({ min: 100, max: 500 }),
          ocupacao_atual: faker.number.int({ min: 50, max: 400 }),
          necessidades_urgentes: faker.helpers.arrayElements(['Água potável', 'Colchões', 'Fraldas', 'Soro fisiológico'], { min: 1, max: 3 })
        });
      }
    }
    await abrigosCol.insertMany(abrigos);

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
    await pessoasCol.insertMany(pessoas);

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

    console.log(`Sucesso! A base está pronta no Atlas para os desenvolvedores.`);

  } catch (error) {
    console.error("Erro ao popular o banco:", error);
  } finally {
    await client.close();
  }
}

popularBanco();