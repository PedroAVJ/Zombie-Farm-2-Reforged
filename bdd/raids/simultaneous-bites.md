Feature: invasion performance with a full zombie army
Given sixteen zombies are fighting the invasion boss at once
And the game is running at a phone-sized, CPU-throttled profile
When the zombies repeatedly bite the boss
Then the hidden farm should not animate behind the invasion
And the battle should not visibly freeze during simultaneous impacts
