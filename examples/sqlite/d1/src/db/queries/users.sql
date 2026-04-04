-- @name GetUser :one
SELECT * FROM users WHERE id = $id;

-- @name ListUsers :many
SELECT * FROM users ORDER BY name;

-- @name CreateUser :one
INSERT INTO users (name, email) VALUES ($name, $email) RETURNING *;

-- @name UpdateUser :exec
UPDATE users SET name = $name, email = $email, updated_at = datetime('now') WHERE id = $id;

-- @name DeleteUser :exec
DELETE FROM users WHERE id = $id;

-- @name ListPublishedPosts :many
SELECT * FROM posts WHERE published = 1 ORDER BY created_at DESC;

-- @name CreatePost :one
INSERT INTO posts (title, body, author_id) VALUES ($title, $body, $author_id) RETURNING *;
