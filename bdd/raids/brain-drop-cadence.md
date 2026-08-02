Feature: invasions / grow every brain-stack chance without a forced award
Given I keep winning invasions against bosses
And the ordinary brain-drop rolls all miss
When I complete four successful invasions
Then the fourth win should still be allowed to award no brains
And the chance of every brain stack should be four times its starting chance
And later invasions should naturally guarantee higher stacks as their own odds reach one hundred percent
