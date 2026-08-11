terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.100"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  # Bucket name (contains account id) is supplied via gitignored backend.hcl
  backend "s3" {
    key            = "production/terraform.tfstate"
    region         = "ap-east-2"
    dynamodb_table = "fieldnotes-tw-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = "ap-east-2"

  default_tags {
    tags = {
      Project     = "fieldnotes.tw"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}

provider "aws" {
  alias  = "ses"
  region = "ap-northeast-1"

  default_tags {
    tags = {
      Project     = "fieldnotes.tw"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}
