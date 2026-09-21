package auth

import (
	"crypto/rand"
	"encoding/base64"
	"sync"
)

// phải dùng sync.Map vì đọc nhiều, ghi ít
var sessions sync.Map

func GenerateToken() (string, error) {
	// 32 bytes encoded to Base64 always results in 44 characters
	buf := make([]byte, 32, 32+44)
	if _, err := rand.Read(buf[:32]); err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(buf)
	return string(encoded), nil
}

func SaveSession(token string) {
	sessions.Store(token, true)
}

func ValidSession(token string) bool {
	_, ok := sessions.Load(token)
	return ok
}

func DeleteSession(token string) {
	sessions.Delete(token)
}
