Feature: Brains / show original-scale amounts
Given my farm owns 8 internal brain units
When I view the farm HUD
Then the brain counter should show 80
When I open a Market item that costs 1 internal brain unit
Then its price should show 10 brains
And buying it should still deduct 1 internal brain unit
And the saved brain balance should remain in the existing internal scale
