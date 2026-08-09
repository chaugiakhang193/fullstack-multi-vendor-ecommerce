package index

import (
	"embed"
	"errors"
	"fmt"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	// Blank import de dang ky driver database scheme "pgx5" cho golang-migrate.
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

// migrationsFS nhung toan bo file .sql trong thu muc migrations vao binary. Duong
// dan la tuong doi so voi FILE nay, nen migrations/ phai nam trong internal/index/.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

// RunMigrations chay migration embedded len Neon TRUOC khi service nhan message. Dam
// bao bang product_index + processed_events + extension da san. Goi luc boot, fail-fast
// neu loi. migrate.ErrNoChange (khong co migration moi) KHONG phai loi.
func RunMigrations(databaseURL string) error {
	migrationsDir := "migrations"
	src, err := iofs.New(migrationsFS, migrationsDir)
	if err != nil {
		return fmt.Errorf("mo migration embedded loi: %w", err)
	}

	migrateURL := toPgxURL(databaseURL)
	driverName := "iofs"
	m, err := migrate.NewWithSourceInstance(driverName, src, migrateURL)
	if err != nil {
		return fmt.Errorf("khoi tao migrate loi: %w", err)
	}
	// m.Close() tra ve 2 loi (source, database) - bo qua khi dong, khong che loi chinh.
	defer func() { _, _ = m.Close() }()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("chay migration loi: %w", err)
	}
	return nil
}

// toPgxURL doi tien to postgres:// hoac postgresql:// (Neon cap) sang pgx5:// de khop
// driver golang-migrate da dang ky o blank import ben tren. Giu nguyen phan con lai
// (host, query sslmode=require). pgxpool.New o store.go van dung URL goc, khong doi.
func toPgxURL(raw string) string {
	postgresqlPrefix := "postgresql://"
	postgresPrefix := "postgres://"
	pgx5Prefix := "pgx5://"

	if strings.HasPrefix(raw, postgresqlPrefix) {
		trimmed := strings.TrimPrefix(raw, postgresqlPrefix)
		return pgx5Prefix + trimmed
	}
	if strings.HasPrefix(raw, postgresPrefix) {
		trimmed := strings.TrimPrefix(raw, postgresPrefix)
		return pgx5Prefix + trimmed
	}
	return raw
}
