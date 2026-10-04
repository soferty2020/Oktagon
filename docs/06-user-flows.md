# 06. Core User Flows

## Onboarding
Admin creates user -> links athlete -> invite -> user sets password -> login -> app loads role/permissions -> user sees linked athlete(s).

## Attendance
Trainer opens today's session -> sees athlete list -> marks attendance -> saves -> parent sees updated history.

## Planned absence
Parent opens upcoming session -> reports absence -> trainer sees planned absence marker -> after session trainer confirms final attendance.

## Payment
Superadmin opens athlete -> selects month -> enters amount/method/date -> marks fully paid if appropriate -> debt state recalculated.

## Freeze
Parent sends freeze request -> superadmin reviews -> starts freeze with effective date -> later ends freeze, including retroactively if needed.

## Schedule exception
Authorized staff opens session -> changes time/branch/trainer or cancels -> change is logged -> all clients see updated schedule.

## Group chat
User opens group chat -> sends text -> members see message -> read state stored.
