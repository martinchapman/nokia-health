const express = require('express');
const router = express.Router();
const request = require('request');
const querystring = require('querystring');
const models = require('../models');

const config = require('config');
const util = require('../lib/util');
const nokiaUtil = require('../lib/nokiaUtil');

const NOKIA_CALLBACK = config.get('nokia_api.CALLBACK_BASE') + "/nokia/connect/callback";

function subscribeNotifications(req, res) {

  params = {};
  params["action"] = "subscribe";
  params["user_id"] = req.query.userid;
  params["callbackurl"] = querystring.escape(config.get('nokia_api.CALLBACK_BASE') + "/nokia/notify");
  params["comment"] = "comment";
  params["appli"] = 4;

  nokiaUtil.notificationSubscribe(req, res, params, function() {});

}

function storeAccessToken(req, res) {

  models.users.findOrCreate({

    where: {

      nokiaID: req.query.userid

    },
    defaults: {

      patientID: req.session.patientID,
      nokiaID: req.query.userid,
      token: req.session.oauth_request_token,
      secret: req.session.oauth_request_token_secret,
      refresh: req.session.oauth_refresh_token

    }

  }).error(function(err) {

    console.log(err);

  }).then(function() {

    if ( config.get('nokia_api.CONVERT_OAUTH') ) {

      var form = {
        "grant_type": "refresh_token",
        "client_id": config.get('nokia_api_auth.NOKIA_CLIENT_ID'),
        "client_secret": config.get('nokia_api_auth.NOKIA_CONSUMER_SECRET'),
        "refresh_token": req.session.oauth_request_token  + ":" + req.session.oauth_request_token_secret
      };

      var formData = querystring.stringify(form);

      util.postRequest(config.get('nokia_api.NOKIA_ACCESS_TOKEN_BASE_OAUTH2'), formData, function() {

        console.log(error + " " + JSON.stringify(response) + " " + body);

      });

      request({

        url: config.get('nokia_api.NOKIA_ACCESS_TOKEN_BASE_OAUTH2'),
        headers: {
          'Content-Length': body.length,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        method: "POST",
        body: body,

      }, function (error, response, body) {

        subscribeNotifications(req, res);

      });

    } else {

      subscribeNotifications(req, res);

    }

  });

}

router.get('/callback', function (req, res) {

  if ( config.OAUTH_VERSION == 2 ) {

    var body = {
      "grant_type": "authorization_code",
      "client_id": config.get('nokia_api_auth.NOKIA_CLIENT_ID'),
      "client_secret": config.get('nokia_api_auth.NOKIA_CONSUMER_SECRET'),
      "code": req.query.code,
      "redirect_uri": NOKIA_CALLBACK
    };

    var bodyData = querystring.stringify(body);

    util.postRequest(config.get('nokia_api.NOKIA_ACCESS_TOKEN_BASE_OAUTH2'), bodyData, function(URL, body, callback) {

      req.session.oauth_request_token = JSON.parse(body.body)["access_token"];
      req.session.oauth_request_token_secret = "";
      req.session.oauth_refresh_token = JSON.parse(body.body)["refresh_token"];
      req.session.save();

      // ~MDC Hack for compatibility with OAuth 1.
      req.query.userid = JSON.parse(body.body)["userid"];

      storeAccessToken(req, res);

    });

  } else {

    nokiaUtil.genURLFromRequestToken(req, res, config.get('nokia_api.NOKIA_ACCESS_TOKEN_BASE'), function(url) {

      // Request access token using generated URL.
      request(url, function (error, response, body) {

        // Is overwritten with updated access token for final call (~MDC there's a neater way to do this).
        req.session.oauth_request_token = Util.processKeyValue(body)['oauth_token'];
        req.session.oauth_request_token_secret = Util.processKeyValue(body)['oauth_token_secret'];
        req.session.save();

        storeAccessToken(req, res);

      });

    });

  }

  res.end();

});

module.exports = router;
