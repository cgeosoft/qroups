const cors = require('cors');
const cuid = require('cuid');
const express = require('express');
const { buildSchema, execute, subscribe } = require('graphql');
const { graphqlHTTP } = require('express-graphql');
const { graphQLSchemaFromRxSchema } = require('rxdb/plugins/replication-graphql');
const { PubSub } = require('graphql-subscriptions');
const { SubscriptionServer } = require('subscriptions-transport-ws');
const { createServer } = require('http');

const IPFS = require('ipfs')
const OrbitDB = require('orbit-db');

const GRAPHQL_PORT = 10102;
const GRAPHQL_PATH = '/graphql';
const GRAPHQL_SUBSCRIPTION_PORT = 10103;
const GRAPHQL_SUBSCRIPTION_PATH = '/subscriptions';

const orbitAddress = "/orbitdb/zdpuAwshFLaNRLXiEKhcZEvPYBtVh2wh5GkvgDgfoXVRP1Zrj/ohboyheros"

const heroSchema = {
  version: 2,
  type: 'object',
  properties: {
    id: {
      type: 'string',
      primary: true
    },
    name: {
      type: 'string'
    },
    color: {
      type: 'string'
    },
    createdAt: {
      type: 'number'
    },
    updatedAt: {
      type: 'number'
    }
  },
  indexes: ['name', 'color', 'createdAt', 'updatedAt'],
  required: ['name']
};

const generatedSchema = graphQLSchemaFromRxSchema({
  hero: {
    schema: heroSchema,
    feedKeys: [
      'id',
      'updatedAt'
    ],
    deletedFlag: 'deleted',
    subscriptionParams: {
      // token: 'String!'
    }
  }
});

const graphQLSchema = generatedSchema.asString;

console.log('Server side GraphQL Schema:');
// console.log(graphQLSchema);
const schema = buildSchema(graphQLSchema);

// The root provides a resolver function for each API endpoint
const pubsub = new PubSub();

// The root provides a resolver function for each API endpoint
const root = {
  feedHero: (args, request) => {
    console.log('[FEED] args:', args);
    // authenticateRequest(request);

    if (!args.id) {
      // use empty string because it will always be first on sorting
      args.id = '';
    }

    const documents = db.get('')
    console.log(`[FEED] found: ${documents.filter(d => d.delete === false).length}/${documents.length}`)

    // sorted by updatedAt and primary
    const sortedDocuments = documents.sort((a, b) => {
      if (a.updatedAt > b.updatedAt) return 1;
      if (a.updatedAt < b.updatedAt) return -1;

      if (a.updatedAt === b.updatedAt) {
        if (a.id > b.id) return 1;
        if (a.id < b.id) return -1;
        else return 0;
      }
    });

    // only return where updatedAt >= minUpdatedAt
    const filterForMinUpdatedAtAndId = sortedDocuments.filter(doc => {
      if (!args.updatedAt) {
        return true;
      }
      if (doc.updatedAt < args.updatedAt) {
        return false;
      }
      if (doc.updatedAt > args.updatedAt) {
        return true;
      }
      if (doc.updatedAt === args.updatedAt) {
        if (doc.id > args.id) {
          return true;
        } else {
          return false;
        }
      }
    });

    // limit
    const limited = filterForMinUpdatedAtAndId.slice(0, args.limit);
    return limited;
  },
  setHero: (args, request) => {
    console.log('[SET ] args', args);
    // authenticateRequest(request);

    let doc = args.hero
    doc.updatedAt = Math.round(new Date().getTime() / 1000);

    console.log('[SET ] doc', doc);

    db.put(doc).then(() => {
      pubsub.publish(
        'changedHero',
        {
          changedHero: doc
        }
      );
      console.log('[SET ]', 'published changedHero ' + doc.id);
    })

    return doc;
  },
  changedHero: (args) => {
    console.log('[CHNG] args:', args);
    // validateBearerToken(args.token);

    return pubsub.asyncIterator('changedHero');
  }
};

var db

function startServer() {
  var app = express();

  app.use(cors());

  app.use(GRAPHQL_PATH, graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
  }));

  app.listen(GRAPHQL_PORT);

  const appSubscription = express();
  appSubscription.use(cors);
  const serverSubscription = createServer(appSubscription);
  serverSubscription.listen(GRAPHQL_SUBSCRIPTION_PORT, () => {
    console.log(
      'Started graphql-subscription endpoint at http://localhost:' +
      GRAPHQL_SUBSCRIPTION_PORT + GRAPHQL_SUBSCRIPTION_PATH
    );
    const subServer = new SubscriptionServer(
      {
        execute,
        subscribe,
        schema,
        rootValue: root
      },
      {
        server: serverSubscription,
        path: GRAPHQL_SUBSCRIPTION_PATH,
      }
    );
    return subServer;
  });

  // setInterval(() => {
  //   const flag = new Date().getTime();
  //   pubsub.publish(
  //       'humanChanged',
  //       {
  //           humanChanged: {
  //               id: 'foobar-' + flag,
  //               name: 'name-' + flag
  //           }
  //       }
  //   );
  //   console.log('published humanChanged ' + flag);
  // }, 1000);

  console.log(`Running a GraphQL API server at http://localhost:${GRAPHQL_PORT}/graphql`);
}

async function main() {

  const ipfs = await IPFS.create({
    repo: './ipfs',
    start: true,
    EXPERIMENTAL: {
      pubsub: true,
    },
  })
  const orbitdb = await OrbitDB.createInstance(ipfs, {
    directory: './orbitdb'
  })

  // db = await orbitdb.docs("ohboyheros", {
  //   accessController: {
  //     write: ['*']
  //   },
  //   overwrite: true,
  //   indexBy: "id",
  // })

  db = await orbitdb.docs(orbitAddress, {
    overwrite: true,
    indexBy: "id",
  })

  await db.load()

  db.events.on('replicated', () => {
  })

  console.log(`db: ${db.address}`)

  startServer()

}

main()