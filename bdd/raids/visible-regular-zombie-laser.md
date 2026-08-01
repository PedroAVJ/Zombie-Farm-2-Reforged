Feature: visible Regular zombie Laser Beam
Given a Regular zombie has unlocked Laser Beam in an invasion
When its automatic Laser Beam hits an enemy while advancing
Then the enemy should lose Life
And a bright green beam should flash between the zombie and that enemy
