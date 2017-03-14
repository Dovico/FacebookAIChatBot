'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const apiai = require('apiai');
const app = express()
const token = process.env.FB_PAGE_ACCESS_TOKEN 			//// Environment variable: Replace with your key
const myAI = apiai(process.env.CLIENT_ACCESS_TOKEN); 	//// Environment variable: Replace with your key
const WEATHER_API_KEY = process.env.WEATHER_API_KEY  	//// Environment variable: Replace with your key

// set the port
app.set('port', (process.env.PORT || 5000))

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// Process application/json
app.use(bodyParser.json())

// Index route
app.get('/', function(req, res) {
    res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function(req, res) {
    if (req.query['hub.verify_token'] === 'ArbitraryTokenOfYourOwn') {
        res.send(req.query['hub.challenge'])
    }
    res.send('Error, wrong token')
})

// core route for chat bot and conversational content
app.post('/webhook/', function(req, res) {
    var messaging_events = req.body.entry[0].messaging
    for (var i = 0; i < messaging_events.length; i++) {
        var event = req.body.entry[0].messaging[i]
        var sender = event.sender.id
        //// Check that message has content
        if (event.message && event.message.text) {
            var text = event.message.text
            //// Check user input: Used to test Card based response
            if (text === 'Cards') {
                sendCards(sender)
                continue
            }
        }
        //// Check user input: Is this a postback request from Cards?
        if (event.postback) {
            var text = JSON.stringify(event.postback)
            sendTextMessage(sender, "Postback received: " + text.substring(0, 200), token)
            continue
        }
        //// Default response
        if (event.message && event.message.text) {
        	sendTextMessage(sender, event)
        }
    }
    res.sendStatus(200)
})
//// Custom webhook route for API.ai: Used when user asks weather questions
//// This is an example of using api.ai to process user input and deliver custom 3rd party data in response
//// API.ai receives the user input "What is the weather in Moncton?", and triggers webhook.
app.post('/ai', (req, res) => { //// this route needs to be set in api.ai webhooks
    if (req.body.result.action === 'weather') { //// check ACTION variable from api.ai
        let city = req.body.result.parameters['geo-city']; //// get geoloacation variable from api.ai
        let restUrl = 'http://api.openweathermap.org/data/2.5/weather?APPID=' + WEATHER_API_KEY + '&q=' + city; /// construct URI
        request.get(restUrl, (err, response, body) => { /// request weather
            if (!err && response.statusCode == 200) { /// check for success
                let json = JSON.parse(body); /// parse body
                let msg = json.weather[0].description + ' and the temperature is ' + json.main.temp + ' ℃'; /// contruct response
                return res.json({ //// return weather to api.ai
                    speech: msg,
                    displayText: msg,
                    source: 'weather'
                });
            } else { //// if errors
                return res.status(400).json({
                    status: {
                        code: 400,
                        errorType: 'I failed to look up the city name.'
                    }
                });
            }
        })
    }
}) 

// Spin up the server
app.listen(app.get('port'), function() {
    console.log('running on port', app.get('port'))
})

//// Function to send standard message to user
function sendTextMessage(sender, event) {
    var text = event.message.text //// user text input from Facebook
    var apiai = myAI.textRequest(text, { /// send user input to API.ai
        sessionId: 'ilovebots' // use any arbitrary id
    });

    /// when response is received from api.ai, extract message and send back to user via FB Graph
    apiai.on('response', (response) => { 
        var aiText = response.result.fulfillment.speech;
        request({
            url: 'https://graph.facebook.com/v2.6/me/messages',
            qs: { access_token: token }, //// facebook access token: environment variable
            method: 'POST',
            json: {
                recipient: { id: sender }, //// user id
                message: { text: aiText }, //// response from api.ai
            }
        }, function(error, response, body) { /// if error sending to api.ai, send to user
            if (error) {
                console.log('Error sending messages: ', error)
            } else if (response.body.error) {
                console.log('Error: ', response.body.error)
            }
        })
    });

    apiai.on('error', (error) => {
        console.log(error);
    });

    apiai.end();

}

//// Facebook Messenger can send messages structured as cards or buttons.
function sendCards(sender) {
    var messageData = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": [{
                    "title": "First card",
                    "subtitle": "Element #1 of an hscroll",
                    "image_url": "https://www.dovico.com/webflow/images/Dovico%20Logo%20Updated.svg",
                    "buttons": [{
                        "type": "web_url",
                        "url": "#", /// link for call to action
                        "title": "Call to Action Link"
                    }, {
                        "type": "postback",
                        "title": "User Response Postback",
                        "payload": "Payload for first element in a generic bubble",
                    }],
                }, {
                    "title": "Second card",
                    "subtitle": "Element #2 of an hscroll",
                    "image_url": "https://www.dovico.com/webflow/images/Dovico%20Logo%20Updated.svg",
                    "buttons": [{
                        "type": "postback",
                        "title": "User Response Postback",
                        "payload": "Payload for second element in a generic bubble",
                    }],
                }]
            }
        }
    }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: token },
        method: 'POST',
        json: {
            recipient: { id: sender },
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}
