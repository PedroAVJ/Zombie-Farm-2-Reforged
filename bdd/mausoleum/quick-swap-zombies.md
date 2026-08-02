Feature: Mausoleum / quickly swap farm and stored zombies
Given my farm is at its deployed zombie limit
And a garden zombie is deployed on the farm
And an army zombie is stored in the Mausoleum
When I select the garden zombie from the farm roster
And I select the army zombie from the Mausoleum roster
And I choose Swap Zombies
Then the army zombie should be deployed in the garden zombie's farm position
And the garden zombie should be stored in the Mausoleum
And the deployed and stored zombie counts should stay unchanged
