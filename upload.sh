#!/bin/bash
cd $1
tar cf - $2 | nc $3 $4