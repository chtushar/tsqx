-- @name GetUser :one
SELECT * FROM users WHERE id = $id;

-- @name ListUsers :many
SELECT * FROM users ORDER BY name;

-- @name CreateUser :one
INSERT INTO users (name, email) VALUES ($name, $email) RETURNING *;

-- @name DeleteUser :exec
DELETE FROM users WHERE id = $id;

-- @name ListUsersPaginated :many
SELECT * FROM users
ORDER BY name
-- @include paginate
;
