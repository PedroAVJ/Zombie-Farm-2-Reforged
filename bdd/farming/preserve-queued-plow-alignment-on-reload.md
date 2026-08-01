Feature: farming / preserve queued Plow alignment on reload

Given an aligned Plow rectangle is queued on my expanded farm
When I refresh before the farmer finishes plowing it
Then every queued plot should be plowed at its originally selected position
And no queued plot should shift off the existing farm grid
