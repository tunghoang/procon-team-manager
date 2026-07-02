#!/usr/bin/env bash
set -euo pipefail

############################
# Configuration
############################

MYSQL_ROOT_PASSWORD="rootpassword"

MYSQL_DATABASE="appdb"
MYSQL_USER="appuser"
MYSQL_PASSWORD="apppassword"

REDIS_PASSWORD="redispassword"

############################
# Install
############################

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y mysql-server redis-server ufw

systemctl enable mysql
systemctl enable redis-server

systemctl start mysql
systemctl start redis-server

############################
# Configure MySQL
############################

MYSQL_CNF="/etc/mysql/mysql.conf.d/mysqld.cnf"

if grep -q "^bind-address" "$MYSQL_CNF"; then
    sed -i "s/^bind-address.*/bind-address = 0.0.0.0/" "$MYSQL_CNF"
else
    echo "bind-address = 0.0.0.0" >> "$MYSQL_CNF"
fi

mysql <<EOF
ALTER USER 'root'@'localhost'
IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';

CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\`;

CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%'
IDENTIFIED BY '${MYSQL_PASSWORD}';

GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'%';

FLUSH PRIVILEGES;
EOF

systemctl restart mysql

############################
# Configure Redis
############################

REDIS_CONF="/etc/redis/redis.conf"

sed -i "s/^bind .*/bind 0.0.0.0/" "$REDIS_CONF"
sed -i "s/^protected-mode .*/protected-mode no/" "$REDIS_CONF"
sed -i "s/^port .*/port 6379/" "$REDIS_CONF"

if grep -q "^# *requirepass" "$REDIS_CONF"; then
    sed -i "s/^# *requirepass.*/requirepass ${REDIS_PASSWORD}/" "$REDIS_CONF"
elif grep -q "^requirepass" "$REDIS_CONF"; then
    sed -i "s/^requirepass.*/requirepass ${REDIS_PASSWORD}/" "$REDIS_CONF"
else
    echo "requirepass ${REDIS_PASSWORD}" >> "$REDIS_CONF"
fi

systemctl restart redis-server

############################
# Firewall
############################

# ufw allow 22/tcp
# ufw allow 3306/tcp
# ufw allow 6379/tcp

# ufw --force enable

############################
# Finished
############################

echo
echo "========================================"
echo "Installation Complete"
echo "========================================"
echo
echo "MySQL"
echo "  Host: $(hostname -I | awk '{print $1}')"
echo "  Port: 3306"
echo "  Database: ${MYSQL_DATABASE}"
echo "  User: ${MYSQL_USER}"
echo "  Password: ${MYSQL_PASSWORD}"
echo "  Root Password: ${MYSQL_ROOT_PASSWORD}"
echo
echo "Redis"
echo "  Host: $(hostname -I | awk '{print $1}')"
echo "  Port: 6379"
echo "  Password: ${REDIS_PASSWORD}"
echo
echo "Connection examples:"
echo "mysql -h <SERVER_IP> -P3306 -u${MYSQL_USER} -p${MYSQL_DATABASE}"
echo "redis-cli -h <SERVER_IP> -p6379 -a ${REDIS_PASSWORD}"
echo
ss -tln | grep -E "3306|6379"