const { buildSchema } = require('graphql');
const { graphQLSchemaFromRxSchema } = require('rxdb/plugins/replication-graphql');
const { messageCollection } = require('@qroups/commons/models/message');

const generatedSchema = graphQLSchemaFromRxSchema({
  message: messageCollection
});

const graphQLSchema = generatedSchema.asString;
console.log('Server side GraphQL Schema:');

const schema = buildSchema(graphQLSchema);
exports.schema = schema;
