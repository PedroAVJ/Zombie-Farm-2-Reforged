Feature: time warp / advance a Personal Cloud farm
Given my Local Farm is connected to Personal Cloud
And a planted zombie needs one day to finish growing
When I advance the Local Farm by one day
Then the game should reload with the zombie ready to harvest
When I reopen the same cloud farm
Then the zombie should still be ready to harvest
