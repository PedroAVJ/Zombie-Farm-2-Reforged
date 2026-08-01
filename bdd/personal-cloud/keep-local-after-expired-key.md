Feature: Personal Cloud / deliberately keep an expired phone local
Given my iPhone app has an expired Personal Cloud key
When I enter something that is not a private Personal Cloud link
Then the reconnect screen should stay open
And it should explain that the link is invalid
When I choose Keep This Device Local
Then the phone's independent Local Farm should load
And the phone should no longer say that it is connected to Personal Cloud
