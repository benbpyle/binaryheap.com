---
title: Querying AWS Healthlake from Go
author: "Benjamen Pyle"
description: AWS HealthLake querying with Go requires signed REST API requests to fetch FHIR Bundles and Patient resources from your datastore endpoint.
pubDatetime: 2023-01-09T00:00:00Z
tags:
  - aws
  - data
  - healthlake
  - programming
  - serverless
draft: false
---

When working with Healthcare data when of the things that's often mentioned or discussed is "Is your data interoperable?" As a developer and an architect, that's a really loaded word to me because if I can expose my data over files, APIs or some consistent channel like TCP, then by definition my system is interoperable. Per my Mac dictionary "interoperable" is an adjective defined like this :: _(of computer systems or software) able to exchange and make use of information_ ::

However where things get a little more nuanced is when the definition includes some common healthcare specific formats and more specifically [HL7's FHIR](https://www.hl7.org/fhir/resourcelist.html). So when you have this problem, there are certain tools that you need to use. There are several opensource solutions that you could select but when you are an AWS' customer, you start with AWS first. And they just so happy to have a set of capabilities wrapped around a product called Healthlake.

Per AWS, they define Healthlake like this. "_Amazon HealthLake is a HIPAA-eligible service enabling healthcare and life sciences companies to securely store and transform their data into a consistent and queryable fashion_"

For the purposes of this article, think of Healthlake like another database. You write FHIR compliant resources into it and you can query/select resources from it. I'll dive more later on more operations but for this article, it's focused on querying.

If you want to jump straight to the code, I've got a sample [Github Repository](https://github.com/benbpyle/healthlake-query-sample) setup with a simple Go program for fetching a FHIR Bundle and then the individually selecting the FHIR Patients from the Bundle.

## Get Patients

What's happening below is that I'm building a URL, Signing it as [AWS](https://docs.aws.amazon.com/general/latest/gr/signing-aws-api-requests.html) requires and then Unmarshalling the `[]byte` that comes back into a [FHIR Bundle](https://www.hl7.org/fhir/bundle.html). Pretty straight forward. Healthlake is one of the few AWS services that doesn't have an nice SDK for dealing with Querying so it might look a little more bare metal, but it's just a REST API request at the end of the day

```go
func getPatients() (*fhir.Bundle, error) {
	url := fmt.Sprintf("https://%s/%s/r4/Patient", healthlakeEndpoint, healthlakeDatastore)
	req, err := http.NewRequest(http.MethodGet, url, nil)

	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	// the request must by V4 signed
	_, _ = signer.Sign(req, nil, "healthlake", "us-west-2", time.Now())

	resp, err := httpClient.Do(req)

	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()
	var bundle fhir.Bundle
	decoder := json.NewDecoder(resp.Body)
	//	b, err := io.ReadAll(resp.Body)
	err = decoder.Decode(&bundle)

	return &bundle, err
}
```

## Looping the Bundle

A FHIR Bundle contains "Entries" and those entries will be other "Resources" in the FHIR ecosystem.

```go
for _, e := range bundle.Entry {
   // do something with the bundle entry
}
```

The above loop gives me the opportunity to now do something with the enclose Resource

```go
var p fhir.Patient
_ = json.Unmarshal(e.Resource, &p)
log.Printf("Fetching a single patient with an id of: (%s)", *p.Id)
// grab a single patient by id.  Patient is a FHIR resource
// the Healthlake API is REST so the ID makes the Resource
patient, err := getPatientById(*p.Id)
if err != nil {
	log.WithFields(log.Fields{
		"err": err,
	}).Fatalln("error fetching single patient")
}

log.WithFields(log.Fields{
	"patient": patient,
}).Infof("printing out the patient")
```

Inside of a Bundle Entry is the Resource which a Go type called RawMessage. From there, I can Unmarshal that into the proper [FHIR Patient](https://www.hl7.org/fhir/patient.html)

A little deeper inspection of the `getPatientById(...)` looks like this

```
func getPatientById(id string) (*fhir.Patient, error) {
	url := fmt.Sprintf("https://%s/%s/r4/Patient/%s", healthlakeEndpoint, healthlakeDatastore, id)
	req, err := http.NewRequest(http.MethodGet, url, nil)

	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	_, _ = signer.Sign(req, nil, "healthlake", "us-west-2", time.Now())

	resp, err := httpClient.Do(req)

	if err != nil {
		return nil, err
	}

	defer resp.Body.Close()
	var patient fhir.Patient
	decoder := json.NewDecoder(resp.Body)
	//	b, err := io.ReadAll(resp.Body)
	err = decoder.Decode(&patient)

	return &patient, err
}
```

Very similar to the Bundle fetching. The difference is that I'm actually asking for a specific resource on the end of the `r4/Patient/<id>` and instead of getting a Bundle back, I'll just get a Patient (if that Patient exists).

## Wrap Up

As you can see, it's pretty easy to query Healthlake. Remember, the power in the solution can be explored [here](https://aws.amazon.com/healthlake/features/). It really is a nice product and when you have the problem of needing your data to be stored

- In FHIR format
- Organized by the Patient
- Versioned
- Stored at scale

then Healthlake is a nice choice for this problem. As always, hope this was helpful.
