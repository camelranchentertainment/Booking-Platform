-- rollback/20261021200000_admin_accounts_view.down.sql
-- Undoes 20261021200000_admin_accounts_view.sql. Nothing else depends on it.
begin;
drop view if exists admin_views.accounts;
drop schema if exists admin_views;
commit;
