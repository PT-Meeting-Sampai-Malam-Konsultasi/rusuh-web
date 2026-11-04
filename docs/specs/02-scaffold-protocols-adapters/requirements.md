# Requirements Document

## Introduction

Define the framework-free contracts in src/core/protocols and their implementations in src/infrastructure (scaffold-app step 2).

## Glossary

| Term     | Definition                                    |
| -------- | --------------------------------------------- |
| Scaffold | The architecture base every feature builds on |

## Requirements

### Requirement 1: Pure protocols

**User Story:**

AS a developer
I WANT core contracts with no library types
SO THAT services and use cases stay framework-free

#### Acceptance Criteria

- SHALL define HttpProtocol, HttpResponse, HttpError, StorageProtocol, TokenStoreProtocol, AnalyticsProtocol, QueueStreamProtocol
- SHALL NOT import anything in a protocol file

### Requirement 2: Configuration

**User Story:**

AS a developer
I WANT one place that reads the environment
SO THAT public values are typed and missing ones fail fast

#### Acceptance Criteria

- SHALL read NEXT_PUBLIC_* variables literally in src/infrastructure/config.ts only
- WHEN a required variable is missing THEN createConfig SHALL throw with its name

### Requirement 3: HTTP adapter

**User Story:**

AS a service author
I WANT a normalised HTTP client
SO THAT every failure has a status and a stable code

#### Acceptance Criteria

- SHALL add Accept-Language and the bearer token per request
- WHEN a request gets 401 THEN it SHALL refresh the session once and retry
- SHALL map API problems to their code, no response to NETWORK_ERROR, timeouts to TIMEOUT

### Requirement 4: Queue stream adapter

**User Story:**

AS the waiting room
I WANT SSE with the token headers
SO THAT the front of the queue updates every second (ADR-0015)

#### Acceptance Criteria

- SHALL dispatch frontier and turn events
- WHEN connecting fails, the first event is slow or the stream goes silent THEN it SHALL call onFallback
