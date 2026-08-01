Feature: Personal Cloud / reconnect a phone after storage migration
Given my iPhone app still has a Personal Cloud key from before the storage migration
And the cloud farm is currently controlled by my Mac
When I open the farm on my iPhone
Then the game should stop before loading the phone's separate Local Farm
And it should tell me that Personal Cloud needs to reconnect
When I paste the current private Personal Cloud link
Then it should tell me that the cloud farm is active on my Mac
And I should be able to take over the cloud farm on my iPhone
