const cors = require('cors');
const express = require('express');
const { execute, subscribe } = require('graphql');
const { graphqlHTTP } = require('express-graphql');
const { PubSub } = require('graphql-subscriptions');
const { SubscriptionServer } = require('subscriptions-transport-ws');
const { createServer } = require('http');
const dotenv = require("dotenv")

const { schema } = require("./schema");
const { feedMessage, setMessage, changedMessage } = require('./functions/message');
const node = require('./libraries/ipfs');

dotenv.config()

// The root provides a resolver function for each API endpoint
const pubsub = new PubSub();

function start() {
  const app = express();
  app.use(cors());
  app.use(process.env.GRAPHQL_PATH, graphqlHTTP({
    schema: schema,
    rootValue: {
      feedMessage,
      setMessage,
      changedMessage,
    },
    graphiql: true,
  }));
  app.listen(process.env.GRAPHQL_PORT);

  const appSubscription = express();
  appSubscription.use(cors);
  const serverSubscription = createServer(appSubscription);
  serverSubscription.listen(process.env.GRAPHQL_SUBSCRIPTION_PORT, () => {
    console.log(
      'Started graphql-subscription endpoint at http://localhost:' +
      process.env.GRAPHQL_SUBSCRIPTION_PORT + process.env.GRAPHQL_SUBSCRIPTION_PATH
    );
    const subServer = new SubscriptionServer({
      execute,
      subscribe,
      schema,
      rootValue: {
        feedMessage,
        setMessage,
        changedMessage,
      },
    }, {
      server: serverSubscription,
      path: process.env.GRAPHQL_SUBSCRIPTION_PATH,
    });
    return subServer;
  });
  console.log(`Running a GraphQL API server at http://localhost:${process.env.GRAPHQL_PORT}/graphql`);

  setInterval(() => {
    if (!node) return
    console.log("[IPFS]", node.peers)
  }, 5000)
}

start()
