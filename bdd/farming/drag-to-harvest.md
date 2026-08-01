Feature: farming / drag to harvest ripe crops

  Scenario: Queue several harvests with one drag
    Given several ripe crops are next to each other
    When I press one ripe crop and drag across the others
    Then every crossed crop should be queued for harvest
    And crossing a plot more than once should not queue it twice
