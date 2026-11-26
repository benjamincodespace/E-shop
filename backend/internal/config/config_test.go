package config

import "testing"

func TestCloudinaryConfigIssue(t *testing.T) {
	empty := &Config{}
	if issue := empty.CloudinaryConfigIssue(); issue == "" {
		t.Fatal("an empty Cloudinary config should be reported")
	}
	if empty.CloudinaryConfigured() {
		t.Fatal("CloudinaryConfigured must stay false without credentials")
	}

	partial := &Config{CloudinaryCloudName: "demo-cloud", CloudinaryAPIKey: "key"}
	if issue := partial.CloudinaryConfigIssue(); issue == "" {
		t.Fatal("a partially configured Cloudinary setup should be reported")
	}
	if partial.CloudinaryConfigured() {
		t.Fatal("CloudinaryConfigured must require all three values")
	}

	// Spaces and underscores cannot appear in a cloud name, so they catch a
	// pasted display name before the first upload fails at Cloudinary.
	malformed := &Config{
		CloudinaryCloudName: "my cloud_name",
		CloudinaryAPIKey:    "key",
		CloudinaryAPISecret: "secret",
	}
	if issue := malformed.CloudinaryConfigIssue(); issue == "" {
		t.Fatal("a malformed cloud name should be reported")
	}

	valid := &Config{
		CloudinaryCloudName: "demo-cloud",
		CloudinaryAPIKey:    "key",
		CloudinaryAPISecret: "secret",
	}
	if issue := valid.CloudinaryConfigIssue(); issue != "" {
		t.Fatalf("expected a usable config, got %q", issue)
	}
	if !valid.CloudinaryConfigured() {
		t.Fatal("expected a complete config to be usable")
	}
}
