package main

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
)

var worldProfilePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

func worldProfileDataDir(worldsDir, profile string) (string, error) {
	if !worldProfilePattern.MatchString(profile) {
		return "", errors.New("world profile must be 1 to 64 lowercase letters, digits, hyphens, or underscores and start with a letter or digit")
	}
	return filepath.Join(worldsDir, profile), nil
}

func listWorldProfilesIn(worldsDir string) ([]string, error) {
	entries, err := os.ReadDir(worldsDir)
	if errors.Is(err, os.ErrNotExist) {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	profiles := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() && worldProfilePattern.MatchString(entry.Name()) {
			profiles = append(profiles, entry.Name())
		}
	}
	return profiles, nil
}
