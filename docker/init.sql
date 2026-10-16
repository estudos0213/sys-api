-- Local development credentials only. Use separate, restricted roles in deployment.
CREATE ROLE app_user LOGIN PASSWORD 'app_password';
GRANT CONNECT ON DATABASE sys_api TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
