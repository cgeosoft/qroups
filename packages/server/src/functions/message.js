const node = require("../libraries/ipfs");

function feedMessage(args, request) {
  console.log('[FEED] args:', args);
  // authenticateRequest(request);

  if (!args.id) {
    // use empty string because it will always be first on sorting
    args.id = '';
  }

  const documents = node.get('')
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
}

function setMessage(args, request) {
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
}

function changedMessage(args) {
  console.log('[CHNG] args:', args);
  // validateBearerToken(args.token);

  return pubsub.asyncIterator('changedHero');
}


module.exports = {
  feedMessage,
  setMessage,
  changedMessage,
}
