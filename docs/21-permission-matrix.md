# 21. Permission Matrix

| Capability | MEMBER | STAFF default | SUPERADMIN |
|---|---|---|---|
| Own linked athletes | read | — | all |
| Own schedule | read | — | all |
| Own attendance | read | — | all |
| Own planned absence | create | — | all |
| Own freeze request | create | — | all |
| Assigned groups | — | read | all |
| Assigned athletes | — | read | all |
| Athlete contacts | — | read | all |
| Attendance assigned groups | — | edit | all |
| Schedule | read own | read assigned | all |
| Finance | own status only | none | all |
| News | read/comment | read/comment | all |
| Chat | own conversations | assigned conversations | all |
| Permissions | none | none | all |

## Individual permissions
STAFF capabilities may be extended explicitly:
`athletes.view`, `athletes.edit`, `athletes.contacts.view`, `groups.view`, `groups.edit`, `attendance.view`, `attendance.edit`, `schedule.view`, `schedule.edit`, `schedule.cancel`, `schedule.change_trainer`, `schedule.change_location`, `payments.view`, `payments.edit`, `freezes.view`, `freezes.edit`, `news.create`, `news.edit`, `news.delete`, `news.moderate`, `chat.use`, `branches.view`, `branches.manage`, `users.manage`, `permissions.manage`, `analytics.view`.

## Enforcement
Проверяются одновременно capability и resource scope. Наличие permission не дает автоматического доступа к чужому филиалу/группе, если scope не расширен.
