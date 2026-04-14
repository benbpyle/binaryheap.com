---
title: Parsing a Parquet file with Golang
author: "Benjamen Pyle"
description: parsing Apache Parquet format stored in S3 using Golang
pubDatetime: 2023-02-19T00:00:00Z
tags:
  - aws
  - data
  - golang
  - programming
draft: false
---

I know it's 2023, but you can't get away from processing files. In a world of Events, APIs and Sockets, files still exist as a medium for moving data around. And a very common one at that. In recent years I've found myself dealing with Apache Parquet format files. And more specifically I often end up dealing with them coming out of AWS S3. If you are a consumer at all of the AWS DMS product when replicating, you will find out that parquet format is a great way to deal with your data as its designed for efficient storage and retrieval. There aren't too many options for parsing a parquet file with Golang, but I've find a library I really enjoy and the article below will describe how to make the best use of it.

As always, here is the link to the [Github Repository](https://github.com/benbpyle/go-parquet-example) if you want to skip ahead

## What is Apache Parquet

> Apache Parquet is an open source, column-oriented data file format designed for efficient data storage and retrieval. It provides efficient data compression and encoding schemes with enhanced performance to handle complex data in bulk. Parquet is available in multiple languages including Java, C++, Python, etc…
>
> https://parquet.apache.org/

## Downloading the Parquet File

For working with S3, I really like the Golang library called `s3manager`. Here is the [SDK documentation](https://docs.aws.amazon.com/sdk-for-go/api/service/s3/s3manager/). What I like about it is that is a higher level abstraction on top of the normal S3 library. For instance, to download a file from a bucket, you simply do something like this

```go
downloader := s3manager.NewDownloader(sess)
_, err = downloader.DownloadWithContext(ctx, file,
	&s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})

```

The downloader will put the file in the path you specify in the DownloadWithContext method in the "file" parameter. It's just a string.

## Parsing File with Golang

Parsing an Apache parquet file with Golang will seem super family to other interface based unmarshalling like DyanamoDB as well as JSON. For similarities with DDB, you can see how to do this in the referenced [article](https://binaryheap.com/7un0)

The parse function looks like this

```go
func ParseFile(fileName string) ([]ParquetUser, error) {
	fr, err := floor.NewFileReader(fileName)
	var fileContent []ParquetUser
	if err != nil {
		return nil, err
	}

	for fr.Next() {
		rec := &ParquetUser{}
		if err := fr.Scan(rec); err != nil {
			// continue along is it's just a malformed row
			if errors.Is(err, ErrIllegalRow) {
				continue
			}
			return nil, err
		}

		fileContent = append(fileContent, *rec)
	}

	return fileContent, nil
}

```

First off, notice that I open a FileReader from the parquet-go library.

From there, I create a slice for holding the output of what's being unmarshalled.

Then we loop and scan. And for each call to Scan, the unmarshall method that implements the parquet-go interface is called. That method looks like this

```go
func (r *ParquetUser) UnmarshalParquet(obj interfaces.UnmarshalObject) error {
	id, err := obj.GetField("id").Int32()

	if err != nil {
		return errors.New(fmt.Sprintf("error unmarshalling row on field (id)"))
	}

	firstName, err := obj.GetField("firstName").ByteArray()

	if err != nil {
		return errors.New(fmt.Sprintf("error unmarshalling row on field (firstName)"))
	}

	lastName, err := obj.GetField("lastName").ByteArray()

	if err != nil {
		return errors.New(fmt.Sprintf("error unmarshalling row on field (lastName)"))
	}

	role, err := obj.GetField("role").ByteArray()

	if err != nil {
		return errors.New(fmt.Sprintf("error unmarshalling row on field (role)"))
	}

	// note this is a time.Time but comes across as an Int64
	lastUpdated, err := obj.GetField("lastUpdated").Int64()

	if err != nil {
		return errors.New(fmt.Sprintf("error unmarshalling row on field (lastUpdated)"))
	}

	parsed := time.UnixMicro(lastUpdated)

	if err != nil {
		log.WithFields(log.Fields{
			"err": err,
		}).Error("error parsing time")
		return errors.New(fmt.Sprintf("(lastUpdated) is not in the right format"))
	}

	r.Id = int(id)
	r.FirstName = string(firstName)
	r.LastName = string(lastName)
	r.Role = string(role)
	r.LastUpdated = parsed
	return nil
}

```

Really not too much going on up there outside of fetching fields and then putting them into the structs fields. The one main thing to point out that is a "gotcha" is that the LastUpdated field is a `time.Time`. The parquet-go library treats time as an `Int64`. Note this line for converting what comes out of the library into a `time.Time`

`parsed := time.UnixMicro(lastUpdated)`

## Running the Program

From there, it's just a matter of putting it all together. Here's the body of `main`

```go
func main() {
	file, err := DownloadFile(context.TODO(), sess, bucket, key)
	if err != nil {
		log.WithFields(log.Fields{
			"err": err,
		}).Error("error downloading the file")
	}

	contents, err := ParseFile(file)
	if err != nil {
		log.WithFields(log.Fields{
			"err": err,
		}).Error("error parsing the file")
	}

	err = DeleteFile(file)
	if err != nil {
		log.WithFields(log.Fields{
			"err": err,
		}).Error("error deleting the file")
	}

	for _, c := range contents {
		log.WithFields(log.Fields{
			"record": c,
		}).Debug("printing the record")
	}
}

```

In a nutshell ...

- Download the file
- Parse the file
- Delete the file
- Loop and print output

![parsing output](/images/Screenshot-2023-02-19-at-9.58.00-AM.png)

## Helpful Tips

1.  I'm using VSCode a lot more these days and I'm sort of weaning myself off of Goland. So you'll find a `launch.json` file in the `.vscode` directory. There you can set the environment variables you need to run the program
2.  Viewing parquet files is really a pain I've found. There are few tools that I've liked. Online viewers get in the way of my workflow. BUT I found this VSCode plugin to be FANTASTIC. [Here is the link to the marketplace](https://marketplace.visualstudio.com/items?itemName=dvirtz.parquet-viewer)

## Wrapping Up

Hopefully you found this helpful. Like I mentioned in the beginning, files aren't going away as a data medium. And Apache's Parquet is an excellent one when you deal with larger datasets and it'll be one of the options you can choose when replicating with DMS as the output.

I continue to just love Golang's simplicity and performance as well as the development experience. The parquet-go library has a few quirks but overall, 5-start rating for me.
