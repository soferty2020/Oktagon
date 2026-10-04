# 20. Release Process

## Branching
- main — production-ready
- short-lived feature branches
- optional release/* branch only when needed

## PR requirements
- linked issue;
- scope summary;
- test evidence;
- DB migration notes;
- API breaking-change note;
- screenshots for UI changes;
- docs updated.

## Versioning
SemVer.

## Release checklist
- all required CI green;
- migrations tested on staging copy;
- backup created;
- smoke tests passed;
- changelog prepared;
- rollback plan documented.

## Rollback
Application release must be rollbackable independently where possible. Destructive DB migrations require expand/migrate/contract approach.
