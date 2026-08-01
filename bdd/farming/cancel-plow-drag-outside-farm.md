Feature: farming / cancel a Plow drag outside the farm

Given I have dragged a Plow rectangle across several farm plots
When I release the pointer over the farm controls and switch to Select
Then no plots from that rectangle should be queued for plowing
And the Plow rectangle should disappear completely
