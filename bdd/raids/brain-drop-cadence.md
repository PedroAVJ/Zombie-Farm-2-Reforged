Feature: invasions / avoid long brain-drop droughts
Given I keep winning invasions against bosses
And the ordinary brain-drop rolls all miss
When I complete four successful invasions
Then the fourth win should award at least one brain
And brain drops should still award one, three, or five brains
