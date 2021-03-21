const IPFS = require('ipfs')

let node

IPFS
  .create({
    repo: "../../data"
  })
  .then(_node => {
    console.log("ipfs started")
    node = _node
  })

module.exports = node
