Feature: invasions / use Space for obstacle reactions
Given an invasion has no active concentration bubble
And a clickable carrot wall is blocking my zombies
When I press Space
Then the wall should receive the same hit as a pointer click
And the page should not scroll
When a concentration bubble and an obstacle are both active
And I press Space
Then the concentration bubble should be handled first
And the obstacle should wait for the next Space press
