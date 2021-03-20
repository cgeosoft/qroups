const cors = require('cors');
const express = require('express');
const { buildSchema, execute, subscribe } = require('graphql');
const { graphqlHTTP } = require('express-graphql');
const { graphQLSchemaFromRxSchema } = require('rxdb/plugins/replication-graphql');
const { PubSub } = require('graphql-subscriptions');
const { SubscriptionServer } = require('subscriptions-transport-ws');
const { createServer } = require('http');

const GRAPHQL_PORT = 10102;
const GRAPHQL_PATH = '/graphql';
const GRAPHQL_SUBSCRIPTION_PORT = 10103;
const GRAPHQL_SUBSCRIPTION_PATH = '/subscriptions';

var documents = []
const heroSchema = {
  version: 0,
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
    updatedAt: {
      type: 'number'
    }
  },
  indexes: ['name', 'color', 'updatedAt'],
  required: ['color']
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

function sortByUpdatedAtAndPrimary(a, b) {
  if (a.updatedAt > b.updatedAt) return 1;
  if (a.updatedAt < b.updatedAt) return -1;

  if (a.updatedAt === b.updatedAt) {
      if (a.id > b.id) return 1;
      if (a.id < b.id) return -1;
      else return 0;
  }
}

console.log('Server side GraphQL Schema:');
// console.log(graphQLSchema);
const schema = buildSchema(graphQLSchema);

// The root provides a resolver function for each API endpoint
const pubsub = new PubSub();

// The root provides a resolver function for each API endpoint
const root = {
  feedHero: (args, request) => {
    console.log('## feedHero()');
    console.log(args);
    // authenticateRequest(request);

    if (!args.id) {
      // use empty string because it will always be first on sorting
      args.id = '';
    }

    // sorted by updatedAt and primary
    const sortedDocuments = documents.sort(sortByUpdatedAtAndPrimary);

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
    console.log('## setHero()');
    console.log(args);
    // authenticateRequest(request);

    const doc = args.hero;
    documents = documents.filter(d => d.id !== doc.id);
    doc.updatedAt = Math.round(new Date().getTime() / 1000);
    documents.push(doc);

    pubsub.publish(
      'changedHero',
      {
        changedHero: doc
      }
    );
    console.log('published changedHero ' + doc.id);

    return doc;
  },
  changedHero: (args) => {
    console.log('## changedHero()');
    console.dir(args);
    // validateBearerToken(args.token);

    return pubsub.asyncIterator('changedHero');
  }
};


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