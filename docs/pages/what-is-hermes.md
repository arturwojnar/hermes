<img src="../public/logo-main.png" alt="Hermes logo" style="margin: 0 auto; width: 70%; display: block;" />
<br />

📜*Hermes is the god of reliable deliveries. His two insignias are an outbox and a letter. Just write a message, put it into an envoy, and put it in the box. That's it! You don't need prayers, keeping crossed fingers and hope. Your message will be delivered for sure! Hermes is on it!*

---

### What is Hermes?

**Hermes** is a production-ready implementation of the [Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html).\
Use it to provide [at-least-once delivery](https://microservices.io/patterns/communication-style/idempotent-consumer.html) to your system's consumers, so depite a timeout or a message broker outage, **Hermes** will keep trying to deliver that message to the broker.\
After Chris Richardson:

> At-least once delivery guarantees that a message broker will deliver a message to a consumer even if errors occur. One side-effect, however, is that the consumer can be invoked repeatedly for the same message

The Outbox Pattern makes an atomic operation from a database operation (e.g. modifying an `Aggregate` or `Entity`) and publishing an event thanks to the fact that the event publishing happens first in the database along with the operation. Later **Hermes** makes sure that event goes to the message broker.

### Why I need an outbox?

When you rely on a _message broker_ to exchange events, you should ensure the reliability of the deliveries for those events.\
It may happen between persisting an entity (a database operation) and publishing an event, so the two are separate systems, and your application will encounter an outage. You will end up then with an inconsistent state, e.g. the data will be persisted but resulting event won't be published.\
Thanks to the Outbox Pattern you avoid using of the 2PC (Two Phase Commit).\
The drawback of the outbox pattern is that it adds additional complexity to your system; that's why **Hermes** overcomes this inconvenience.
