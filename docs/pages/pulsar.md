# Pulsar integration

[Apache Pulsar](https://pulsar.apache.org/) is an open-source, distributed messaging and streaming platform that can serve also the purpose as a queue.

## Multiple processes of the same service

You've written your service that utilizes `Hermes`🌿 and now you want to deploy it on `production`. The problem you will encounter is the fact that you should have only one `Hermes` instance working for single partition. If you run two Hermeses for a single partition, then you will bump into a race condition where the two Hermeses will be trying to send the same event.

It's the issue of accessing the same resource by multiple processes or resource synchronization. One of the solutions is [a mutex (binary variation of a semaphore)](<https://en.wikipedia.org/wiki/Lock_(computer_science)#:~:text=In%20computer%20science%2C%20a%20lock,threads%20of%20execution%20at%20once>).

## Mutex based on an Exclusive topic

We can use Apache Pulsar and an Exclusive subscription to simulate a mutex behaviour.

<<< @/../examples/pulsar/pulsar-mutex.ts

## Defining some events

<<< @/../examples/common/events.ts

## One partition example

First, define a function that will continously send events based on `Hermes` instance:

<<< @/../examples/pulsar/do-publishing.ts

Secondly, we want to know whether the events are actually sent to the Pulsar:

<<< @/../examples/pulsar/do-receiving.ts

And the final wrap-up:

<<< @/../examples/pulsar/pulsar-one-partition-mutex.ts
