'use strict';
const express = require('express'),
      router = express.Router(),
    crypto = require('crypto'),
      Parser = require('rss-parser');
const {getAccount} = require("../nitter");

router.get('/:name', async function (req, res) {
  let name = req.params.name;
  if (!name) {
    return res.status(400).send('Bad request.');
  }
  else {
    let db = req.app.get('db');
    let domain = req.app.get('domain');
    let username = name;
    name = `${name}@${domain}`;
    let result = await getAccount(username, 'actor');

    if (result === undefined) {
      return res.status(404).json(`No entry found for ${name}`);
    }

    // Added this followers URI for Pleroma compatibility, see https://github.com/dariusk/rss-to-activitypub/issues/11#issuecomment-471390881
    // New Actors should have this followers URI but in case of migration from an old version this will add it in on the fly
    if (result.actor.followers === undefined) {
      result.actor.followers = `https://${domain}/u/${username}/followers`;
    }
    res.json(result.actor);
  }
});

router.get('/:name/followers', async function (req, res) {
  let name = req.params.name;
  if (!name) {
    return res.status(400).send('Bad request.');
  }
  else {
    let db = req.app.get('db');
    let domain = req.app.get('domain');
    let result = await getAccount(name, 'followers');
    let followers = result.followers;
    // console.log(followers);
    if (!followers) {
      followers = [];
    }
    let followersCollection = {
      "type":"OrderedCollection",
      "totalItems":followers.length,
      "id":`https://${domain}/u/${name}/followers`,
      "first": {
        "type":"OrderedCollectionPage",
        "totalItems":followers.length,
        "partOf":`https://${domain}/u/${name}/followers`,
        "orderedItems": followers,
        "id":`https://${domain}/u/${name}/followers?page=1`
      },
      "@context":["https://www.w3.org/ns/activitystreams"]
    };
    res.json(followersCollection);
    // TODO: return actual list of followers
  }
});

module.exports = router;
