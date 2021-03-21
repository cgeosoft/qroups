const messageSchema = {
  title: "message schema",
  description: "message schema",
  version: 0,
  type: "object",
  properties: {
    id: {
      type: "string",
      primary: true
    },
    ts: { type: "number" },
    content: { type: "string" },
    owner: { type: "string" },
    updatedAt: { type: "number" }
  },
  indexes: [
    "ts",
    "updatedAt"
  ],
  required: [
    "ts",
    "owner",
    "content"
  ]
}

const messageCollection = {
  schema: messageSchema,
  feedKeys: [
    'id',
    'updatedAt'
  ],
  deletedFlag: 'deleted',
  subscriptionParams: {
    // token: 'String!'
  }
}

module.exports = {
  messageSchema,
  messageCollection,
}
