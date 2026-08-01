Feature: invasions / use focus bubbles with the keyboard
Given an invasion is waiting for me to pop a butterfly focus bubble
When I press Space
Then the focus bubble should disappear
And the zombie should continue charging
When the full-brain focus bubble appears
And I press Space
Then the zombie should enter the battle
