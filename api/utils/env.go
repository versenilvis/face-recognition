// Package utils - Env
package utils

import (
	"os"
	"strconv"
)

func GetEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func GetEnvAsInt(name string, defaultVal int) int {
	if valStr, exists := os.LookupEnv(name); exists {
		if val, err := strconv.Atoi(valStr); err == nil {
			return val
		}
	}
	return defaultVal
}

func GetEnvAsFloat(name string, defaultVal float64) float64 {
	if valStr, exists := os.LookupEnv(name); exists {
		if val, err := strconv.ParseFloat(valStr, 64); err == nil {
			return val
		}
	}
	return defaultVal
}

func GetEnvAsBool(key string, defaultVal bool) bool {
	valStr := GetEnv(key, "")
	if valStr == "" {
		return defaultVal
	}

	val, err := strconv.ParseBool(valStr)
	if err != nil {
		return defaultVal
	}
	return val
}
