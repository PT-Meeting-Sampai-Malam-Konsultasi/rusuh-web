# Requirements Document

## Introduction

Set up the Awilix container, the AwilixRegistry type and the four registries in their strict order (scaffold-app step 3).

## Glossary

| Term     | Definition                                    |
| -------- | --------------------------------------------- |
| Scaffold | The architecture base every feature builds on |

## Requirements

### Requirement 1: Container and registry type

**User Story:**

AS a developer
I WANT one typed container
SO THAT every dependency is declared in one place

#### Acceptance Criteria

- SHALL create the container in PROXY mode with strict lifetimes
- SHALL declare every key in AwilixRegistry

### Requirement 2: Four registries

**User Story:**

AS a developer
I WANT registration split by layer
SO THAT later layers depend only on earlier ones

#### Acceptance Criteria

- SHALL register infrastructure → services → helpers → controllers through registerAll()
- SHALL register adapters and services as singletons and hooks as asValue
- WHEN registerAll() is called twice THEN it SHALL register only once

### Requirement 3: Completeness

**User Story:**

AS a reviewer
I WANT a check that every declared key is registered
SO THAT missing registrations fail in CI, not at runtime

#### Acceptance Criteria

- SHALL fail a test when a key in AwilixRegistry has no registration, or a registration has no key
