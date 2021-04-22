'use strict';
const express = require('express'),
      router = express.Router(),
    crypto = require('crypto'),
      Parser = require('rss-parser'),
    generateRSAKeypair = require('generate-rsa-keypair'),
    {createWebfinger, createActor} = require("./actor.js");

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
    let feedData = undefined;
    let feedUrl = undefined;

    let result = db.prepare('select actor from accounts where name = ?').get(name);
    if (result === undefined) {
      // attempt to get nitter user
      let nitterUrl = req.app.get('nitter');
      try {
        let parser = new Parser();
        feedUrl = `${nitterUrl}/${username}/rss`;
        feedData = await parser.parseURL(feedUrl);
        let displayName = feedData.title;
        let description = feedData.description;
        // create keypair
        let pair = generateRSAKeypair();
        let actorRecord = createActor(username, domain, pair.public, displayName, feedData.image.url, description);
        let webfingerRecord = createWebfinger(username, domain);
        const apikey = crypto.randomBytes(16).toString('hex');
        let actorJson = JSON.stringify(actorRecord)
        db.prepare('insert or replace into accounts(name, actor, apikey, pubkey, privkey, webfinger) values(?, ?, ?, ?, ?, ?)').run( `${username}@${domain}`, actorJson, apikey, pair.public, pair.private, JSON.stringify(webfingerRecord));
        result = {
          actor: actorJson,
        };
        // do not add feed; do not poll until follow occurs
      } catch (e) {
        return res.status(404).json(`Error occured: ${e} with ${feedUrl}`);
      }
    }

    if (req.headers.accept && (req.headers.accept.includes('application/activity+json') || req.headers.accept.includes('application/json') || req.headers.accept.includes('application/json+ld'))) {
      let tempActor = JSON.parse(result.actor);
      // Added this followers URI for Pleroma compatibility, see https://github.com/dariusk/rss-to-activitypub/issues/11#issuecomment-471390881
      // New Actors should have this followers URI but in case of migration from an old version this will add it in on the fly
      if (tempActor.followers === undefined) {
        tempActor.followers = `https://${domain}/u/${username}/followers`;
      }
      res.json(tempActor);
    }
    else {
      let actor = JSON.parse(result.actor);
      if (!feedData) {
        let resultFeed = db.prepare('select content, feed from feeds where username = ?').get(username);
        if (resultFeed === undefined) {
          return res.status(404).json(`Something went very wrong!`);
        }
        feedData = JSON.parse(resultFeed.content);
        feedUrl = resultFeed.feed;
      }

      let imageUrl = null;
      // if image exists set image
      if (actor.icon && actor.icon.url) {
        imageUrl = actor.icon.url;
      }
      let description = null;
      if (actor.summary) {
        description = actor.summary;
      }
      res.render('user', { displayName: actor.name, items: feedData.items, accountName: '@'+name, imageUrl: imageUrl, description, feedUrl });
    }
  }
});

router.get('/:name/followers', function (req, res) {
  let name = req.params.name;
  if (!name) {
    return res.status(400).send('Bad request.');
  }
  else {
    let db = req.app.get('db');
    let domain = req.app.get('domain');
    let result = db.prepare('select followers from accounts where name = ?').get(`${name}@${domain}`);
    let followers = JSON.parse(result.followers);
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
    //res.json(JSON.parse(result.actor));
  }
});

module.exports = router;
