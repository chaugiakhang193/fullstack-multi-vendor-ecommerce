package index

import "testing"

// TestToPgxURL kiem tra viec doi scheme cho golang-migrate. Day la buoc de vo tinh
// lam hong nhat: driver database/pgx/v5 dang ky scheme "pgx5", con Neon cap URL
// "postgresql://" — quen doi thi migrate bao "unknown driver postgresql" luc boot.
func TestToPgxURL(t *testing.T) {
	testCases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "postgresql scheme (dang Neon cap) doi sang pgx5",
			in:   "postgresql://user:pass@ep-abc.neon.tech/searchdb?sslmode=require",
			want: "pgx5://user:pass@ep-abc.neon.tech/searchdb?sslmode=require",
		},
		{
			name: "postgres scheme doi sang pgx5",
			in:   "postgres://user:pass@localhost:5432/searchdb?sslmode=disable",
			want: "pgx5://user:pass@localhost:5432/searchdb?sslmode=disable",
		},
		{
			name: "scheme la giu nguyen, khong tu doi bua",
			in:   "mysql://user:pass@localhost:3306/searchdb",
			want: "mysql://user:pass@localhost:3306/searchdb",
		},
		{
			name: "chuoi rong giu nguyen",
			in:   "",
			want: "",
		},
		{
			name: "query sslmode phai duoc giu nguyen sau khi doi scheme",
			in:   "postgresql://u:p@host/db?sslmode=require&pool_max_conns=5",
			want: "pgx5://u:p@host/db?sslmode=require&pool_max_conns=5",
		},
	}

	for _, tc := range testCases {
		testCase := tc
		t.Run(testCase.name, func(t *testing.T) {
			got := toPgxURL(testCase.in)
			if got != testCase.want {
				t.Errorf("toPgxURL(%q) = %q, muon %q", testCase.in, got, testCase.want)
			}
		})
	}
}
