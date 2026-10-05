"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentMethod = exports.MembershipPeriodStatus = exports.Weekday = exports.ConversationMemberRole = exports.ConversationType = exports.SessionStatus = exports.AttendanceStatus = exports.UserStatus = exports.AthleteStatus = exports.ROLE_PERMISSIONS = exports.FINANCIAL_PERMISSION_CODES = exports.PERMISSION_CODES = exports.PermissionCode = exports.USER_ROLES = exports.UserRole = void 0;
exports.UserRole = {
    MEMBER: 'MEMBER',
    STAFF: 'STAFF',
    SUPERADMIN: 'SUPERADMIN',
};
exports.USER_ROLES = Object.values(exports.UserRole);
exports.PermissionCode = {
    AthletesView: 'athletes.view',
    AthletesEdit: 'athletes.edit',
    AthletesContactsView: 'athletes.contacts.view',
    GroupsView: 'groups.view',
    GroupsEdit: 'groups.edit',
    AttendanceView: 'attendance.view',
    AttendanceEdit: 'attendance.edit',
    ScheduleView: 'schedule.view',
    ScheduleEdit: 'schedule.edit',
    ScheduleCancel: 'schedule.cancel',
    ScheduleChangeTrainer: 'schedule.change_trainer',
    ScheduleChangeLocation: 'schedule.change_location',
    PaymentsView: 'payments.view',
    PaymentsEdit: 'payments.edit',
    FreezesView: 'freezes.view',
    FreezesEdit: 'freezes.edit',
    NewsCreate: 'news.create',
    NewsEdit: 'news.edit',
    NewsDelete: 'news.delete',
    NewsModerate: 'news.moderate',
    ChatUse: 'chat.use',
    BranchesView: 'branches.view',
    BranchesManage: 'branches.manage',
    UsersManage: 'users.manage',
    PermissionsManage: 'permissions.manage',
    AnalyticsView: 'analytics.view',
};
exports.PERMISSION_CODES = Object.values(exports.PermissionCode);
exports.FINANCIAL_PERMISSION_CODES = [
    exports.PermissionCode.PaymentsView,
    exports.PermissionCode.PaymentsEdit,
    exports.PermissionCode.FreezesView,
    exports.PermissionCode.FreezesEdit,
];
exports.ROLE_PERMISSIONS = {
    MEMBER: [exports.PermissionCode.ChatUse],
    STAFF: [
        exports.PermissionCode.AthletesView,
        exports.PermissionCode.AthletesContactsView,
        exports.PermissionCode.GroupsView,
        exports.PermissionCode.AttendanceView,
        exports.PermissionCode.AttendanceEdit,
        exports.PermissionCode.ScheduleView,
        exports.PermissionCode.ChatUse,
    ],
    SUPERADMIN: exports.PERMISSION_CODES,
};
exports.AthleteStatus = {
    ACTIVE: 'ACTIVE',
    FROZEN: 'FROZEN',
    ARCHIVED: 'ARCHIVED',
};
exports.UserStatus = {
    INVITED: 'INVITED',
    ACTIVE: 'ACTIVE',
    BLOCKED: 'BLOCKED',
};
exports.AttendanceStatus = {
    PRESENT: 'PRESENT',
    ABSENT: 'ABSENT',
    EXCUSED: 'EXCUSED',
};
exports.SessionStatus = {
    SCHEDULED: 'SCHEDULED',
    CANCELLED: 'CANCELLED',
    MOVED: 'MOVED',
};
exports.ConversationType = {
    GROUP: 'GROUP',
    DIRECT: 'DIRECT',
};
exports.ConversationMemberRole = {
    MEMBER: 'MEMBER',
    TRAINER: 'TRAINER',
};
exports.Weekday = {
    MONDAY: 'MONDAY',
    TUESDAY: 'TUESDAY',
    WEDNESDAY: 'WEDNESDAY',
    THURSDAY: 'THURSDAY',
    FRIDAY: 'FRIDAY',
    SATURDAY: 'SATURDAY',
    SUNDAY: 'SUNDAY',
};
exports.MembershipPeriodStatus = {
    UNPAID: 'UNPAID',
    PARTIALLY_PAID: 'PARTIALLY_PAID',
    PAID: 'PAID',
    FULLY_PAID_MARKED: 'FULLY_PAID_MARKED',
};
exports.PaymentMethod = {
    CASH: 'CASH',
    CARD: 'CARD',
    TRANSFER: 'TRANSFER',
    OTHER: 'OTHER',
};
//# sourceMappingURL=domain.js.map