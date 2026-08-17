package bot

import (
	"context"
	"sync"
	"time"
)

// fakeClient la Client gia dung cho test breaker/retry. No khong biet gi ve Gemini —
// day chinh la diem cua viec de breaker/retry o package nay: chung chi lam viec voi cac
// loi chuan, nen test duoc ma khong can dung mot server HTTP nao.
type fakeClient struct {
	mu sync.Mutex

	// script la day ket qua tra ve theo thu tu goi. Het script thi lap lai phan tu cuoi.
	script []fakeTurn

	calls int
}

// fakeTurn la mot lan tra loi da lap san.
type fakeTurn struct {
	err error
	// emit la cac Event day qua sink truoc khi tra ve, de dung lai canh "da phun chu
	// roi moi hong".
	emit []Event
}

func newFakeClient(script ...fakeTurn) *fakeClient {
	return &fakeClient{script: script}
}

func (f *fakeClient) Generate(ctx context.Context, req Request, sink Sink) (Result, error) {
	f.mu.Lock()
	index := f.calls
	f.calls++
	if index >= len(f.script) {
		index = len(f.script) - 1
	}
	turn := f.script[index]
	f.mu.Unlock()

	for _, ev := range turn.emit {
		if sink != nil {
			if err := sink(ev); err != nil {
				return Result{}, err
			}
		}
	}
	return Result{Text: "ok"}, turn.err
}

func (f *fakeClient) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

// okTurn / failTurn cho goi test doc ngan.
func okTurn() fakeTurn            { return fakeTurn{} }
func failTurn(err error) fakeTurn { return fakeTurn{err: err} }

// blockingClient dung cho test half-open: no dung lai o giua de test giu duoc mot
// request "dang chay" trong khi goi request thu hai.
type blockingClient struct {
	entered chan struct{}
	release chan struct{}
	err     error
}

func (b *blockingClient) Generate(ctx context.Context, req Request, sink Sink) (Result, error) {
	b.entered <- struct{}{}
	<-b.release
	return Result{}, b.err
}

// noSleep thay ham ngu that trong Retrier de test khong ton 1s moi lan thu lai.
func noSleep(ctx context.Context, d time.Duration) bool { return true }
