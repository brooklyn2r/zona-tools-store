# ZONA v0.19 — Stock availability

- stock = 0 -> "Нет в наличии"
- add-to-cart button disabled
- add() has a stock guard
- cart + button cannot exceed stock
- cart shows unavailable item warning
- checkout is disabled if cart contains unavailable/excess quantity
- backend rejects stock=0 order items