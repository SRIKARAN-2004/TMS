"""
Role name constants.

The strings "admin", "manager", "employee" used to be typed out directly
wherever a role check happened - in route dependencies, in controller
logic, even in the database seed script. That meant renaming a role (or
fixing a typo in one of them) required hunting through every file by hand.

Everything that needs to reference a role by name should import these
constants instead of writing the string literal directly. If a role ever
needs to be renamed, this is the only file that changes.
"""


class Roles:
    ADMIN = "admin"
    MANAGER = "manager"
    EMPLOYEE = "employee"

    ALL = [ADMIN, MANAGER, EMPLOYEE]
