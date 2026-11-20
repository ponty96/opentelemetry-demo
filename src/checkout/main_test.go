// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	pb "github.com/open-telemetry/opentelemetry-demo/src/checkout/genproto/oteldemo"
)

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (fn roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestSendOrderConfirmationHasBoundedTimeout(t *testing.T) {
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			deadline, ok := req.Context().Deadline()
			if !ok {
				return nil, fmt.Errorf("email request context has no deadline")
			}

			remaining := time.Until(deadline)
			if remaining <= 0 || remaining > time.Second {
				return nil, fmt.Errorf("email request timeout = %v, want at most %v", remaining, time.Second)
			}

			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader("")),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}
	cs := &checkout{
		emailSvcAddr: "http://email.test",
		httpClient:   client,
	}

	err := cs.sendOrderConfirmation(context.Background(), "test@example.com", &pb.OrderResult{})
	if err != nil {
		t.Fatalf("sendOrderConfirmation() error = %v", err)
	}
}

func TestPostProcessorNeedsAProducer(t *testing.T) {
	cases := []struct {
		name string
		cs   *checkout
		want bool
	}{
		{"no broker configured", &checkout{}, false},
		{"broker configured but producer failed to start", &checkout{kafkaBrokerSvcAddr: "kafka:9092"}, false},
	}
	for _, tc := range cases {
		if got := tc.cs.postProcessorEnabled(); got != tc.want {
			t.Errorf("%s: postProcessorEnabled() = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestShippingCallsCarryDeliveryMethod(t *testing.T) {
	var bodies []map[string]any
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			var body map[string]any
			if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
				return nil, err
			}
			bodies = append(bodies, body)
			resp := `{"tracking_id":"abc","carrier":"dhl"}`
			if strings.HasSuffix(req.URL.Path, "/get-quote") {
				resp = `{"cost_usd":{"currency_code":"USD","units":12}}`
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(resp)),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}
	cs := &checkout{shippingSvcAddr: "http://shipping.test", httpClient: client}
	address := &pb.Address{Country: "DE"}

	if _, err := cs.quoteShipping(context.Background(), address, nil, pb.DeliveryMethod_DELIVERY_METHOD_EXPRESS); err != nil {
		t.Fatalf("quoteShipping() error = %v", err)
	}
	trackingID, carrier, err := cs.shipOrder(context.Background(), address, nil, pb.DeliveryMethod_DELIVERY_METHOD_UNSPECIFIED)
	if err != nil {
		t.Fatalf("shipOrder() error = %v", err)
	}
	if trackingID != "abc" || carrier != "dhl" {
		t.Fatalf("shipOrder() = %q, %q; want abc, dhl", trackingID, carrier)
	}
	if bodies[0]["delivery_method"] != "express" || bodies[1]["delivery_method"] != "standard" {
		t.Fatalf("delivery_method not forwarded: %v", bodies)
	}
}

func TestHealthCheck(t *testing.T) {
	cs := &checkout{}
	resp, err := cs.Check(context.Background(), &healthpb.HealthCheckRequest{})
	if err != nil {
		t.Fatalf("unexpected error from Check: %v", err)
	}
	if resp.GetStatus() != healthpb.HealthCheckResponse_SERVING {
		t.Errorf("expected SERVING status, got %v", resp.GetStatus())
	}
}

func TestServerStartupAndGracefulStop(t *testing.T) {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen on ephemeral port: %v", err)
	}

	srv := grpc.NewServer()
	svc := &checkout{}
	pb.RegisterCheckoutServiceServer(srv, svc)

	healthcheck := health.NewServer()
	healthpb.RegisterHealthServer(srv, healthcheck)

	serverErrCh := make(chan error, 1)
	go func() {
		serverErrCh <- srv.Serve(lis)
	}()

	conn, err := grpc.NewClient(lis.Addr().String(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatalf("failed to connect to test server: %v", err)
	}
	defer conn.Close()

	client := healthpb.NewHealthClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	resp, err := client.Check(ctx, &healthpb.HealthCheckRequest{})
	if err != nil {
		t.Fatalf("health check failed on test server: %v", err)
	}
	if resp.GetStatus() != healthpb.HealthCheckResponse_SERVING {
		t.Errorf("expected SERVING, got %v", resp.GetStatus())
	}

	stoppedCh := make(chan struct{})
	go func() {
		srv.GracefulStop()
		close(stoppedCh)
	}()

	select {
	case <-stoppedCh:
		// Graceful stop completed
	case <-time.After(5 * time.Second):
		t.Fatal("GracefulStop timed out")
	}

	select {
	case err := <-serverErrCh:
		if err != nil && err != grpc.ErrServerStopped {
			t.Errorf("unexpected server exit error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("server did not exit after GracefulStop")
	}
}
