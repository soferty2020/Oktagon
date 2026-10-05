export declare const UserRole: {
    readonly MEMBER: "MEMBER";
    readonly STAFF: "STAFF";
    readonly SUPERADMIN: "SUPERADMIN";
};
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export declare const USER_ROLES: readonly UserRole[];
export declare const PermissionCode: {
    readonly AthletesView: "athletes.view";
    readonly AthletesEdit: "athletes.edit";
    readonly AthletesContactsView: "athletes.contacts.view";
    readonly GroupsView: "groups.view";
    readonly GroupsEdit: "groups.edit";
    readonly AttendanceView: "attendance.view";
    readonly AttendanceEdit: "attendance.edit";
    readonly ScheduleView: "schedule.view";
    readonly ScheduleEdit: "schedule.edit";
    readonly ScheduleCancel: "schedule.cancel";
    readonly ScheduleChangeTrainer: "schedule.change_trainer";
    readonly ScheduleChangeLocation: "schedule.change_location";
    readonly PaymentsView: "payments.view";
    readonly PaymentsEdit: "payments.edit";
    readonly FreezesView: "freezes.view";
    readonly FreezesEdit: "freezes.edit";
    readonly NewsCreate: "news.create";
    readonly NewsEdit: "news.edit";
    readonly NewsDelete: "news.delete";
    readonly NewsModerate: "news.moderate";
    readonly ChatUse: "chat.use";
    readonly BranchesView: "branches.view";
    readonly BranchesManage: "branches.manage";
    readonly UsersManage: "users.manage";
    readonly PermissionsManage: "permissions.manage";
    readonly AnalyticsView: "analytics.view";
};
export type PermissionCode = (typeof PermissionCode)[keyof typeof PermissionCode];
export declare const PERMISSION_CODES: readonly PermissionCode[];
export declare const FINANCIAL_PERMISSION_CODES: readonly PermissionCode[];
export declare const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly PermissionCode[]>>;
export declare const AthleteStatus: {
    readonly ACTIVE: "ACTIVE";
    readonly FROZEN: "FROZEN";
    readonly ARCHIVED: "ARCHIVED";
};
export type AthleteStatus = (typeof AthleteStatus)[keyof typeof AthleteStatus];
export declare const UserStatus: {
    readonly INVITED: "INVITED";
    readonly ACTIVE: "ACTIVE";
    readonly BLOCKED: "BLOCKED";
};
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
export declare const AttendanceStatus: {
    readonly PRESENT: "PRESENT";
    readonly ABSENT: "ABSENT";
    readonly EXCUSED: "EXCUSED";
};
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];
export declare const SessionStatus: {
    readonly SCHEDULED: "SCHEDULED";
    readonly CANCELLED: "CANCELLED";
    readonly MOVED: "MOVED";
};
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];
export declare const ConversationType: {
    readonly GROUP: "GROUP";
    readonly DIRECT: "DIRECT";
};
export type ConversationType = (typeof ConversationType)[keyof typeof ConversationType];
export declare const ConversationMemberRole: {
    readonly MEMBER: "MEMBER";
    readonly TRAINER: "TRAINER";
};
export type ConversationMemberRole = (typeof ConversationMemberRole)[keyof typeof ConversationMemberRole];
export declare const Weekday: {
    readonly MONDAY: "MONDAY";
    readonly TUESDAY: "TUESDAY";
    readonly WEDNESDAY: "WEDNESDAY";
    readonly THURSDAY: "THURSDAY";
    readonly FRIDAY: "FRIDAY";
    readonly SATURDAY: "SATURDAY";
    readonly SUNDAY: "SUNDAY";
};
export type Weekday = (typeof Weekday)[keyof typeof Weekday];
export declare const MembershipPeriodStatus: {
    readonly UNPAID: "UNPAID";
    readonly PARTIALLY_PAID: "PARTIALLY_PAID";
    readonly PAID: "PAID";
    readonly FULLY_PAID_MARKED: "FULLY_PAID_MARKED";
};
export type MembershipPeriodStatus = (typeof MembershipPeriodStatus)[keyof typeof MembershipPeriodStatus];
export declare const PaymentMethod: {
    readonly CASH: "CASH";
    readonly CARD: "CARD";
    readonly TRANSFER: "TRANSFER";
    readonly OTHER: "OTHER";
};
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
